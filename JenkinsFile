
pipeline {
    agent any
    stages {
        stage('Checkout project') {
            steps {
                script {
                    git branch: "master",
                        credentialsId: 'win_ssh_iyede',
                        url: 'git@github.com:iyedexe/reactor.git'
                }
            }
        }

        stage('Installing dependencies') {
            steps {
                script {
                    bat 'pip install -r requirements.txt'
                }
            }
        }
        
        stage ('Running unit tests'){
                steps {
                    bat "pytest"
                }
        }
    }

}